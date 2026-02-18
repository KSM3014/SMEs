import puppeteer from 'puppeteer';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import dotenv from 'dotenv';
import sequelize from '../config/database.js';

dotenv.config();

/**
 * Login Service for data.go.kr
 * Handles automatic login with captcha OCR recognition
 */

class LoginService {
  constructor() {
    this.loginUrl = process.env.DATAGOER_LOGIN_URL;
    this.email = process.env.DATAGOER_EMAIL;
    this.password = process.env.DATAGOER_PASSWORD;
    this.maxRetries = parseInt(process.env.SESSION_MAX_RETRIES || '5');
    this.retryDelay = parseInt(process.env.SESSION_RETRY_DELAY || '5000');
  }

  /**
   * Preprocess captcha image for better OCR accuracy
   */
  async preprocessCaptchaImage(imageBuffer) {
    try {
      // Enhance image: convert to grayscale, increase contrast, denoise
      const processedBuffer = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .threshold(128)
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('Image preprocessing error:', error.message);
      return imageBuffer; // Return original if preprocessing fails
    }
  }

  /**
   * Recognize captcha text using Tesseract.js OCR
   */
  async recognizeCaptcha(imageBuffer) {
    try {
      const startTime = Date.now();

      // Preprocess image
      const processedImage = await this.preprocessCaptchaImage(imageBuffer);

      // Run OCR
      const { data } = await Tesseract.recognize(
        processedImage,
        process.env.TESSERACT_LANG || 'eng',
        {
          logger: info => {
            if (process.env.NODE_ENV === 'development') {
              console.log('OCR Progress:', info.status, info.progress);
            }
          }
        }
      );

      const duration = Date.now() - startTime;

      // Clean up recognized text
      const captchaText = data.text
        .replace(/\s/g, '')           // Remove whitespace
        .replace(/[^A-Z0-9]/gi, '')   // Keep only alphanumeric
        .toUpperCase();               // Convert to uppercase

      const confidence = data.confidence / 100;

      console.log(`[OCR] Recognized: "${captchaText}" (Confidence: ${confidence.toFixed(2)}, Duration: ${duration}ms)`);

      // Log to database
      await this.logCollection('captcha_recognition', 'success', {
        text: captchaText,
        confidence,
        duration_ms: duration
      });

      return {
        text: captchaText,
        confidence,
        duration
      };
    } catch (error) {
      console.error('[OCR] Recognition error:', error.message);
      await this.logCollection('captcha_recognition', 'failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Perform login to data.go.kr with captcha handling
   */
  async login() {
    let browser;
    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      try {
        const startTime = Date.now();

        console.log(`[Login] Attempt ${retryCount + 1}/${this.maxRetries}...`);

        // Launch browser
        browser = await puppeteer.launch({
          headless: process.env.PUPPETEER_HEADLESS === 'true',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
          ]
        });

        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({
          width: parseInt(process.env.PUPPETEER_VIEWPORT_WIDTH || '1920'),
          height: parseInt(process.env.PUPPETEER_VIEWPORT_HEIGHT || '1080')
        });

        // Set user agent to avoid bot detection
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Navigate to login page
        console.log(`[Login] Navigating to ${this.loginUrl}...`);
        await page.goto(this.loginUrl, {
          waitUntil: 'networkidle2',
          timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '30000')
        });

        // Wait for login form
        await page.waitForSelector('input[name="email"], input[id="email"], input[type="email"]', { timeout: 10000 });
        await page.waitForSelector('input[name="password"], input[id="password"], input[type="password"]', { timeout: 10000 });

        // Enter credentials
        console.log('[Login] Entering credentials...');
        await page.type('input[name="email"], input[id="email"], input[type="email"]', this.email, { delay: 100 });
        await page.type('input[name="password"], input[id="password"], input[type="password"]', this.password, { delay: 100 });

        // Handle captcha if present
        let captchaText = null;
        const captchaImageSelector = 'img[alt*="보안"], img[id*="captcha"], img.captcha-image';

        const hasCaptcha = await page.$(captchaImageSelector);

        if (hasCaptcha) {
          console.log('[Login] Captcha detected, attempting OCR...');

          // Screenshot captcha image
          const captchaElement = await page.$(captchaImageSelector);
          const captchaImage = await captchaElement.screenshot();

          // Recognize captcha
          const ocrResult = await this.recognizeCaptcha(captchaImage);
          captchaText = ocrResult.text;

          const confidenceThreshold = parseFloat(process.env.CAPTCHA_CONFIDENCE_THRESHOLD || '0.80');

          if (ocrResult.confidence < confidenceThreshold) {
            console.log(`[Login] Low OCR confidence (${ocrResult.confidence.toFixed(2)}), retrying...`);
            await browser.close();
            retryCount++;
            await this.sleep(this.retryDelay);
            continue;
          }

          // Enter captcha
          const captchaInputSelector = 'input[name="captcha"], input[id="captcha"], input[placeholder*="보안"]';
          await page.waitForSelector(captchaInputSelector, { timeout: 5000 });
          await page.type(captchaInputSelector, captchaText, { delay: 100 });
        }

        // Click login button
        console.log('[Login] Clicking login button...');
        const loginButtonSelector = 'button[type="submit"], input[type="submit"], button:contains("로그인")';
        await page.click(loginButtonSelector);

        // Wait for navigation
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

        // Check if login was successful
        const currentUrl = page.url();
        const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('error');

        if (!isLoggedIn) {
          console.log('[Login] Login failed, checking for error message...');
          const errorMessage = await page.evaluate(() => {
            const errorEl = document.querySelector('.error-message, .alert-danger, [class*="error"]');
            return errorEl ? errorEl.textContent.trim() : 'Unknown error';
          });

          throw new Error(`Login failed: ${errorMessage}`);
        }

        // Extract cookies for session
        const cookies = await page.cookies();

        const duration = Date.now() - startTime;

        console.log(`✅ [Login] Success! (Duration: ${duration}ms)`);

        // Log success to database
        await this.logCollection('login', 'success', {
          captcha_used: hasCaptcha !== null,
          captcha_text: captchaText,
          duration_ms: duration,
          cookies_count: cookies.length
        });

        return {
          browser,
          page,
          cookies,
          success: true,
          duration
        };

      } catch (error) {
        console.error(`[Login] Attempt ${retryCount + 1} failed:`, error.message);

        await this.logCollection('login', 'failed', {
          attempt: retryCount + 1,
          error: error.message
        });

        if (browser) {
          await browser.close();
        }

        retryCount++;

        if (retryCount < this.maxRetries) {
          console.log(`[Login] Retrying in ${this.retryDelay / 1000}s...`);
          await this.sleep(this.retryDelay);
        }
      }
    }

    // All retries exhausted
    const errorMsg = `Login failed after ${this.maxRetries} attempts`;
    console.error(`❌ [Login] ${errorMsg}`);

    await this.logCollection('login', 'failed', {
      error: errorMsg,
      max_retries_exhausted: true
    });

    throw new Error(errorMsg);
  }

  /**
   * Log collection events to database
   */
  async logCollection(logType, status, metadata = {}) {
    try {
      await sequelize.query(`
        INSERT INTO collection_logs (log_type, status, message, metadata, duration_ms)
        VALUES ($1, $2, $3, $4, $5)
      `, {
        bind: [
          logType,
          status,
          metadata.error || `${logType} ${status}`,
          JSON.stringify(metadata),
          metadata.duration_ms || null
        ]
      });
    } catch (error) {
      console.error('Failed to log collection event:', error.message);
    }
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new LoginService();
