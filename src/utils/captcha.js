const svgCaptcha = require("svg-captcha");
const crypto = require("crypto");

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const captchaStore = new Map();

const createCaptcha = () => {
  const captcha = svgCaptcha.create({
    size: 5,
    noise: 2,
    color: true,
    background: "#f3f4f6",
    ignoreChars: "0o1il",
    fontSize: 60,
    width: 180,
    height: 60,
  });

  const captchaId = crypto.randomUUID();

  // Store only a hash of the answer on the server.
  const answerHash = crypto
    .createHash("sha256")
    .update(captcha.text.toLowerCase())
    .digest("hex");

  captchaStore.set(captchaId, {
    answerHash,
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });

  return {
    captchaId,
    image: captcha.data,
  };
};

const verifyCaptcha = (captchaId, answer) => {
  if (
    typeof captchaId !== "string" ||
    typeof answer !== "string" ||
    !captchaId ||
    !answer
  ) {
    return false;
  }

  const record = captchaStore.get(captchaId);

  if (!record) return false;

  // Always consume the CAPTCHA after an attempt.
  captchaStore.delete(captchaId);

  if (record.expiresAt < Date.now()) {
    return false;
  }

  const answerHash = crypto
    .createHash("sha256")
    .update(answer.trim().toLowerCase())
    .digest("hex");

  const expected = Buffer.from(record.answerHash, "hex");
  const actual = Buffer.from(answerHash, "hex");

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
};

// Remove expired CAPTCHA records periodically when this module is used.
const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [id, record] of captchaStore.entries()) {
    if (record.expiresAt <= now) {
      captchaStore.delete(id);
    }
  }
}, 60 * 1000);

cleanupTimer.unref();

module.exports = {
  createCaptcha,
  verifyCaptcha,
};