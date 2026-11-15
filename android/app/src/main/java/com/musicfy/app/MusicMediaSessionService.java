package com.musicfy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.CacheBitmapLoader;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SimpleBitmapLoader;
import java.util.List;

/**
 * Enterprise Native AndroidX Media3 MediaSessionService for MusicFY.
 * Encapsulates the native ExoPlayer playback engine and MediaSession controller.
 * Manages background playback, lock screen metadata, system media notification,
 * and audio focus according to Android 14/15 standards.
 */
public class MusicMediaSessionService extends MediaSessionService {
    private static final String TAG = "MusicMediaSessionService";
    public static final String NOTIFICATION_CHANNEL_ID = "musicfy_playback_channel";
    public static final int NOTIFICATION_ID = 2026;

    private static volatile MusicMediaSessionService instance = null;

    private MediaSession mediaSession;
    private ExoPlayer player;

    public static MusicMediaSessionService getInstance() {
        return instance;
    }

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            switch (playbackState) {
                case Player.STATE_IDLE:
                    Log.d(TAG, "PlaybackState: IDLE");
                    break;
                case Player.STATE_BUFFERING:
                    Log.d(TAG, "PlaybackState: BUFFERING");
                    break;
                case Player.STATE_READY:
                    long duration = player != null ? player.getDuration() : 0L;
                    Log.d(TAG, "PlaybackState: READY (Duration: " + duration + "ms)");
                    break;
                case Player.STATE_ENDED:
                    Log.d(TAG, "PlaybackState: ENDED");
                    break;
            }
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            Log.d(TAG, "onIsPlayingChanged: " + isPlaying);
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            Log.e(TAG, "ExoPlayer playback error: [" + error.errorCode + "] "
                + error.getErrorCodeName() + ": " + error.getMessage(), error);
        }

        @Override
        public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
            if (mediaItem != null && mediaItem.mediaMetadata != null) {
                CharSequence title = mediaItem.mediaMetadata.title;
                Log.d(TAG, "onMediaItemTransition: " + (title != null ? title : "Unknown") + " (Reason: " + reason + ")");
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        ensureNotificationChannel();
        initializeSessionAndPlayer();
        configureNotificationProvider();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(NOTIFICATION_CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    getString(R.string.playback_notification_channel_name),
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Notifikasi dan kontrol musik di status bar dan lockscreen");
                channel.setShowBadge(false);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void configureNotificationProvider() {
        DefaultMediaNotificationProvider notificationProvider = new DefaultMediaNotificationProvider.Builder(this)
            .setNotificationId(NOTIFICATION_ID)
            .setChannelId(NOTIFICATION_CHANNEL_ID)
            .setChannelName(R.string.playback_notification_channel_name)
            .build();
        notificationProvider.setSmallIcon(R.mipmap.ic_launcher);
        setMediaNotificationProvider(notificationProvider);
    }

    private synchronized void initializeSessionAndPlayer() {
        if (player == null) {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .setUsage(C.USAGE_MEDIA)
                .build();

            player = new ExoPlayer.Builder(this)
                .setAudioAttributes(audioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build();

            player.addListener(playerListener);
        }

        if (mediaSession == null && player != null) {
            Intent sessionActivityIntent = new Intent(this, MainActivity.class);
            sessionActivityIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent sessionActivityPendingIntent = PendingIntent.getActivity(
                this,
                0,
                sessionActivityIntent,
                flags
            );

            // Asynchronous, cached bitmap loader for notification, lock screen, and bluetooth metadata
            CacheBitmapLoader bitmapLoader = new CacheBitmapLoader(new SimpleBitmapLoader());

            mediaSession = new MediaSession.Builder(this, player)
                .setSessionActivity(sessionActivityPendingIntent)
                .setBitmapLoader(bitmapLoader)
                .setCallback(new MediaSessionCallback())
                .build();
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        Player p = (mediaSession != null) ? mediaSession.getPlayer() : null;
        if (p == null || !p.getPlayWhenReady() || p.getMediaItemCount() == 0 || p.getPlaybackState() == Player.STATE_ENDED) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
        }

        if (mediaSession != null) {
            Player p = mediaSession.getPlayer();
            if (p != null) {
                p.removeListener(playerListener);
                p.stop();
                p.release();
            }
            mediaSession.release();
            mediaSession = null;
        }
        player = null;

        super.onDestroy();
    }

    // =========================================================================
    // Core Playback Operations (Thread-safe & decoupled from UI)
    // =========================================================================

    public static MediaItem buildMediaItem(
        String uriStr,
        @Nullable String mediaId,
        @Nullable String title,
        @Nullable String artist,
        @Nullable String album,
        @Nullable String artworkUriStr
    ) {
        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
            .setTitle(title != null && !title.trim().isEmpty() ? title : "MusicFY")
            .setArtist(artist != null && !artist.trim().isEmpty() ? artist : "Musik")
            .setAlbumTitle(album != null ? album : "");

        if (artworkUriStr != null && !artworkUriStr.trim().isEmpty()) {
            try {
                metaBuilder.setArtworkUri(Uri.parse(artworkUriStr.trim()));
            } catch (Exception ignored) {}
        }

        String actualMediaId = (mediaId != null && !mediaId.trim().isEmpty()) ? mediaId.trim() : uriStr;

        return new MediaItem.Builder()
            .setUri(uriStr)
            .setMediaId(actualMediaId)
            .setMediaMetadata(metaBuilder.build())
            .build();
    }

    public static MediaItem buildMediaItem(
        String uriStr,
        @Nullable String title,
        @Nullable String artist,
        @Nullable String album,
        @Nullable String artworkUriStr
    ) {
        return buildMediaItem(uriStr, uriStr, title, artist, album, artworkUriStr);
    }

    public synchronized void playTrack(MediaItem mediaItem, boolean autoPlay) {
        if (player == null) return;
        player.setMediaItem(mediaItem);
        player.prepare();
        if (autoPlay) {
            player.play();
        }
    }

    public synchronized void playPlaylist(List<MediaItem> mediaItems, int startIndex, long startPositionMs, boolean autoPlay) {
        if (player == null) return;
        player.setMediaItems(mediaItems, startIndex, startPositionMs);
        player.prepare();
        if (autoPlay) {
            player.play();
        }
    }

    public synchronized void play() {
        if (player != null) player.play();
    }

    public synchronized void pause() {
        if (player != null) player.pause();
    }

    public synchronized void seekTo(long positionMs) {
        if (player != null) player.seekTo(positionMs);
    }

    public synchronized void seekToNext() {
        if (player != null && player.hasNextMediaItem()) {
            player.seekToNextMediaItem();
        }
    }

    public synchronized void seekToPrevious() {
        if (player != null && player.hasPreviousMediaItem()) {
            player.seekToPreviousMediaItem();
        }
    }

    public synchronized void stop() {
        if (player != null) player.stop();
    }

    public synchronized void setVolume(float volume) {
        if (player != null) player.setVolume(Math.max(0f, Math.min(1f, volume)));
    }

    public synchronized long getCurrentPosition() {
        return player != null ? player.getCurrentPosition() : 0L;
    }

    public synchronized long getDuration() {
        return player != null ? player.getDuration() : 0L;
    }

    public synchronized long getBufferedPosition() {
        return player != null ? player.getBufferedPosition() : 0L;
    }

    public synchronized boolean isPlaying() {
        return player != null && player.isPlaying();
    }

    public synchronized int getPlaybackState() {
        return player != null ? player.getPlaybackState() : Player.STATE_IDLE;
    }

    public synchronized ExoPlayer getPlayer() {
        return player;
    }

    private static class MediaSessionCallback implements MediaSession.Callback {
        @Override
        public int onPlayerCommandRequest(MediaSession session, MediaSession.ControllerInfo controller, int playerCommand) {
            return MediaSession.Callback.super.onPlayerCommandRequest(session, controller, playerCommand);
        }
    }
}
