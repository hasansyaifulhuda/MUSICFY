package com.musicfy.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Timeline;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Enterprise Capacitor Native Audio Plugin for MusicFY.
 * Bridges React UI with native AndroidX Media3 ExoPlayer via MediaSessionService.
 * Controls playback through MediaController without duplicate player instances.
 */
@CapacitorPlugin(
    name = "NativeAudioPlayer",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class NativeAudioPlayerPlugin extends Plugin {
    private static final String TAG = "NativeAudioPlayerPlugin";
    private static final long PROGRESS_INTERVAL_MS = 250L;

    private MediaController mediaController = null;
    private ListenableFuture<MediaController> controllerFuture = null;
    private final List<Runnable> pendingOperations = new ArrayList<>();
    private boolean isConnecting = false;
    private boolean isEndedReported = false;

    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            if (mediaController != null && mediaController.isPlaying()) {
                long posMs = mediaController.getCurrentPosition();
                long durMs = mediaController.getDuration();
                if (durMs < 0) durMs = 0L;

                JSObject ret = new JSObject();
                ret.put("positionMs", posMs);
                ret.put("position", (double) posMs / 1000.0);
                ret.put("durationMs", durMs);
                ret.put("duration", (double) durMs / 1000.0);
                notifyListeners("playbackProgress", ret);

                progressHandler.postDelayed(this, PROGRESS_INTERVAL_MS);
            }
        }
    };

    private final Player.Listener controllerListener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            notifyPlaybackState();
            if (playbackState == Player.STATE_READY) {
                isEndedReported = false;
                notifyDuration();
            } else if (playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_IDLE) {
                isEndedReported = false;
            } else if (playbackState == Player.STATE_ENDED) {
                stopProgressTracking();
                if (!isEndedReported) {
                    isEndedReported = true;
                    JSObject ret = new JSObject();
                    if (mediaController != null) {
                        MediaItem item = mediaController.getCurrentMediaItem();
                        if (item != null) {
                            ret.put("mediaId", item.mediaId != null ? item.mediaId : "");
                            if (item.localConfiguration != null && item.localConfiguration.uri != null) {
                                ret.put("uri", item.localConfiguration.uri.toString());
                            }
                        }
                        ret.put("index", mediaController.getCurrentMediaItemIndex());
                    }
                    notifyListeners("playbackEnded", ret);
                }
            }
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            notifyPlaybackState();
            if (isPlaying) {
                startProgressTracking();
            } else {
                stopProgressTracking();
            }
        }

        @Override
        public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
            isEndedReported = false;
            JSObject ret = new JSObject();
            if (mediaItem != null) {
                ret.put("mediaId", mediaItem.mediaId != null ? mediaItem.mediaId : "");
                if (mediaItem.mediaMetadata != null) {
                    ret.put("title", mediaItem.mediaMetadata.title != null ? mediaItem.mediaMetadata.title.toString() : "");
                    ret.put("artist", mediaItem.mediaMetadata.artist != null ? mediaItem.mediaMetadata.artist.toString() : "");
                    ret.put("album", mediaItem.mediaMetadata.albumTitle != null ? mediaItem.mediaMetadata.albumTitle.toString() : "");
                    ret.put("artworkUri", mediaItem.mediaMetadata.artworkUri != null ? mediaItem.mediaMetadata.artworkUri.toString() : "");
                }
            }
            if (mediaController != null) {
                ret.put("index", mediaController.getCurrentMediaItemIndex());
            }
            notifyListeners("trackChanged", ret);
            notifyDuration();
        }

        @Override
        public void onTimelineChanged(@NonNull Timeline timeline, int reason) {
            notifyDuration();
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            Log.e(TAG, "ExoPlayer native error: [" + error.errorCode + "] " + error.getMessage(), error);
            stopProgressTracking();
            JSObject ret = new JSObject();
            ret.put("message", error.getMessage() != null ? error.getMessage() : "Unknown playback error");
            ret.put("code", error.errorCode);
            notifyListeners("playbackError", ret);
        }
    };

    @Override
    public void load() {
        super.load();
        initMediaController();
    }

    private synchronized void initMediaController() {
        if (mediaController != null || isConnecting) {
            return;
        }

        isConnecting = true;
        try {
            Context context = getContext();
            // Start service as a standard service if allowed, while MediaController binds it
            try {
                Intent serviceIntent = new Intent(context, MusicMediaSessionService.class);
                context.startService(serviceIntent);
            } catch (Exception ignored) {
                // Background start restrictions may apply on Android 12+, but MediaController bindService will succeed
            }

            ComponentName sessionTokenComponent = new ComponentName(context, MusicMediaSessionService.class);
            SessionToken sessionToken = new SessionToken(context, sessionTokenComponent);
            controllerFuture = new MediaController.Builder(context, sessionToken).buildAsync();
            controllerFuture.addListener(() -> {
                synchronized (NativeAudioPlayerPlugin.this) {
                    isConnecting = false;
                    try {
                        mediaController = controllerFuture.get();
                        mediaController.addListener(controllerListener);
                        Log.d(TAG, "MediaController successfully connected to MusicMediaSessionService");

                        // Initial state broadcast
                        notifyPlaybackState();
                        notifyDuration();
                        if (mediaController.isPlaying()) {
                            startProgressTracking();
                        }

                        // Execute queued operations
                        for (Runnable op : pendingOperations) {
                            try {
                                op.run();
                            } catch (Exception e) {
                                Log.e(TAG, "Failed running pending operation", e);
                            }
                        }
                        pendingOperations.clear();
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to connect MediaController", e);
                        JSObject err = new JSObject();
                        err.put("message", "MediaController connection failed: " + e.getMessage());
                        err.put("code", -1);
                        notifyListeners("playbackError", err);
                    }
                }
            }, ContextCompat.getMainExecutor(context));
        } catch (Exception e) {
            isConnecting = false;
            Log.e(TAG, "initMediaController exception", e);
        }
    }

    private interface ControllerTask {
        void execute(MediaController controller) throws Exception;
    }

    private void runWithController(PluginCall call, ControllerTask task) {
        new Handler(Looper.getMainLooper()).post(() -> {
            synchronized (NativeAudioPlayerPlugin.this) {
                if (mediaController != null) {
                    try {
                        task.execute(mediaController);
                    } catch (Exception e) {
                        Log.e(TAG, "ControllerTask error", e);
                        call.reject(e.getMessage(), e);
                    }
                } else {
                    // Queue operation and ensure controller is connecting
                    pendingOperations.add(() -> {
                        try {
                            task.execute(mediaController);
                        } catch (Exception e) {
                            Log.e(TAG, "Pending ControllerTask error", e);
                            call.reject(e.getMessage(), e);
                        }
                    });
                    initMediaController();
                }
            }
        });
    }

    private void startProgressTracking() {
        stopProgressTracking();
        progressHandler.post(progressRunnable);
    }

    private void stopProgressTracking() {
        progressHandler.removeCallbacks(progressRunnable);
    }

    private void notifyPlaybackState() {
        if (mediaController == null) return;
        int state = mediaController.getPlaybackState();
        boolean isPlaying = mediaController.isPlaying();

        JSObject ret = new JSObject();
        ret.put("state", mapPlaybackState(state));
        ret.put("isPlaying", isPlaying);
        ret.put("playWhenReady", mediaController.getPlayWhenReady());
        notifyListeners("playbackStateChanged", ret);
    }

    private void notifyDuration() {
        if (mediaController == null) return;
        long durMs = mediaController.getDuration();
        if (durMs > 0) {
            JSObject ret = new JSObject();
            ret.put("durationMs", durMs);
            ret.put("duration", (double) durMs / 1000.0);
            notifyListeners("durationChanged", ret);
        }
    }

    private static String mapPlaybackState(int state) {
        switch (state) {
            case Player.STATE_IDLE:
                return "idle";
            case Player.STATE_BUFFERING:
                return "buffering";
            case Player.STATE_READY:
                return "ready";
            case Player.STATE_ENDED:
                return "ended";
            default:
                return "unknown";
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (mediaController == null) {
            initMediaController();
        } else {
            notifyPlaybackState();
            notifyDuration();
            if (mediaController.isPlaying()) {
                startProgressTracking();
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopProgressTracking();
        synchronized (this) {
            pendingOperations.clear();
            if (controllerFuture != null) {
                MediaController.releaseFuture(controllerFuture);
                controllerFuture = null;
            }
            if (mediaController != null) {
                mediaController.removeListener(controllerListener);
                mediaController.release();
                mediaController = null;
            }
            isConnecting = false;
        }
        super.handleOnDestroy();
    }

    // =========================================================================
    // Plugin Methods (React -> Native Bridge)
    // =========================================================================

    @PluginMethod
    public void loadTrack(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.trim().isEmpty()) {
            call.reject("URI track tidak boleh kosong");
            return;
        }

        String title = call.getString("title", "MusicFY");
        String artist = call.getString("artist", "Musik");
        String album = call.getString("album", "");
        String artworkUri = call.getString("artworkUri", null);
        boolean autoPlay = call.getBoolean("autoPlay", true);
        long positionMs = call.hasOption("positionMs") ? call.getLong("positionMs") : 0L;

        String mediaId = call.getString("mediaId", uri);
        MediaItem mediaItem = MusicMediaSessionService.buildMediaItem(uri, mediaId, title, artist, album, artworkUri);

        runWithController(call, controller -> {
            isEndedReported = false;
            controller.setMediaItem(mediaItem);
            controller.prepare();
            if (positionMs > 0) {
                controller.seekTo(positionMs);
            }
            if (autoPlay) {
                controller.play();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("uri", uri);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        runWithController(call, controller -> {
            isEndedReported = false;
            controller.play();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        runWithController(call, controller -> {
            controller.pause();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        long positionMs;
        if (call.hasOption("positionMs")) {
            positionMs = call.getLong("positionMs");
        } else if (call.hasOption("position")) {
            positionMs = (long) (call.getDouble("position") * 1000.0);
        } else {
            call.reject("Parameter position atau positionMs diperlukan");
            return;
        }

        if (positionMs < 0) positionMs = 0L;

        final long targetPosMs = positionMs;
        runWithController(call, controller -> {
            isEndedReported = false;
            controller.seekTo(targetPosMs);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("positionMs", targetPosMs);
            ret.put("position", (double) targetPosMs / 1000.0);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        if (!call.hasOption("volume")) {
            call.reject("Parameter volume diperlukan");
            return;
        }

        double volInput = call.getDouble("volume");
        if (volInput > 1.0) {
            volInput = volInput / 100.0;
        }
        final float targetVol = (float) Math.max(0.0, Math.min(1.0, volInput));

        runWithController(call, controller -> {
            controller.setVolume(targetVol);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("volume", targetVol);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void setPlaylist(PluginCall call) {
        JSArray tracksArray = call.getArray("tracks");
        if (tracksArray == null || tracksArray.length() == 0) {
            call.reject("Array tracks tidak boleh kosong");
            return;
        }

        int startIndex = call.getInt("startIndex", 0);
        long startPositionMs = call.hasOption("startPositionMs") ? call.getLong("startPositionMs") : 0L;
        boolean autoPlay = call.getBoolean("autoPlay", true);

        List<MediaItem> mediaItems = new ArrayList<>();
        try {
            JSONArray raw = tracksArray;
            for (int i = 0; i < raw.length(); i++) {
                JSONObject item = raw.getJSONObject(i);
                String uri = item.optString("uri", "");
                if (uri.isEmpty()) continue;
                String mediaId = item.optString("mediaId", uri);
                String title = item.optString("title", "MusicFY");
                String artist = item.optString("artist", "Musik");
                String album = item.optString("album", "");
                String artworkUri = item.optString("artworkUri", null);
                mediaItems.add(MusicMediaSessionService.buildMediaItem(uri, mediaId, title, artist, album, artworkUri));
            }
        } catch (Exception e) {
            call.reject("Gagal mem-parsing array playlist: " + e.getMessage(), e);
            return;
        }

        if (mediaItems.isEmpty()) {
            call.reject("Tidak ada track valid dalam playlist");
            return;
        }

        final int validStartIndex = Math.max(0, Math.min(mediaItems.size() - 1, startIndex));
        runWithController(call, controller -> {
            isEndedReported = false;
            controller.setMediaItems(mediaItems, validStartIndex, startPositionMs);
            controller.prepare();
            if (autoPlay) {
                controller.play();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", mediaItems.size());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void next(PluginCall call) {
        runWithController(call, controller -> {
            if (controller.hasNextMediaItem()) {
                controller.seekToNextMediaItem();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void previous(PluginCall call) {
        runWithController(call, controller -> {
            if (controller.hasPreviousMediaItem()) {
                controller.seekToPreviousMediaItem();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runWithController(call, controller -> {
            controller.stop();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        runWithController(call, controller -> {
            int state = controller.getPlaybackState();
            boolean isPlaying = controller.isPlaying();
            JSObject ret = new JSObject();
            ret.put("state", mapPlaybackState(state));
            ret.put("isPlaying", isPlaying);
            ret.put("playWhenReady", controller.getPlayWhenReady());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        runWithController(call, controller -> {
            long posMs = controller.getCurrentPosition();
            JSObject ret = new JSObject();
            ret.put("positionMs", posMs);
            ret.put("position", (double) posMs / 1000.0);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getDuration(PluginCall call) {
        runWithController(call, controller -> {
            long durMs = controller.getDuration();
            if (durMs < 0) durMs = 0L;
            JSObject ret = new JSObject();
            ret.put("durationMs", durMs);
            ret.put("duration", (double) durMs / 1000.0);
            call.resolve(ret);
        });
    }

    // =========================================================================
    // POST_NOTIFICATIONS Runtime Permission (Android 13+ / Target SDK 35)
    // =========================================================================

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
            ret.put("granted", granted);
            ret.put("status", granted ? "granted" : "prompt");
        } else {
            ret.put("granted", true);
            ret.put("status", "granted");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                ret.put("status", "granted");
                call.resolve(ret);
                return;
            }
            requestPermissionForAlias("notifications", call, "permissionCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("status", "granted");
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        } else {
            granted = true;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "denied");
        call.resolve(ret);
    }
}
