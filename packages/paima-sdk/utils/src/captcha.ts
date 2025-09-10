// <reference lib="dom" />
// error[banned-triple-slash-directives]: triple slash directives that modify globals are not allowed

/**
 * This method will dynamically add:
 * <script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
 *
 * You can manually add this script to your HTML,
 * this method is just a helper to do it programmatically.
 */
export async function injectReCaptchaToHTML(document: any, reCAPTCHA_site_key: string): Promise<void> {
  const url =
    `https://www.google.com/recaptcha/api.js?render=${reCAPTCHA_site_key}`;
  return await new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject());
    document.body.append(el);
  });
}
