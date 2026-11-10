/**
 * Stealth Headers & Browser Fingerprint Generator
 * Simulates genuine, modern browser network fingerprints (Chrome 131+, Safari 18, Edge 131, Firefox 133)
 * to prevent YouTube bot detection, 403 Forbidden, and IP throttling.
 */

export interface BrowserProfile {
  name: string;
  userAgent: string;
  headers: Record<string, string>;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    name: 'Chrome-Windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    headers: {
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'Referer': 'https://www.youtube.com/',
      'Cache-Control': 'no-cache',
    },
  },
  {
    name: 'Chrome-Mac',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    headers: {
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.youtube.com/',
      'Cache-Control': 'no-cache',
    },
  },
  {
    name: 'Safari-Mac',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Referer': 'https://www.youtube.com/',
    },
  },
  {
    name: 'Edge-Windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    headers: {
      'Sec-Ch-Ua': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'Referer': 'https://www.youtube.com/',
    },
  },
  {
    name: 'Firefox-Linux',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Referer': 'https://www.youtube.com/',
    },
  },
];

/**
 * Returns a randomized authentic browser profile.
 */
export function getRandomBrowserProfile(): BrowserProfile {
  return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

/**
 * Generates yt-dlp `--add-header` argument pairs along with `--user-agent`.
 */
export function getYtDlpHeaderArgs(profile?: BrowserProfile): string[] {
  const selected = profile || getRandomBrowserProfile();
  const args: string[] = ['--user-agent', selected.userAgent];

  for (const [key, value] of Object.entries(selected.headers)) {
    args.push('--add-header', `${key}:${value}`);
  }

  return args;
}

