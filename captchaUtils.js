const { createCanvas } = require('canvas');

const generateCaptcha = () => {
  const canvas = createCanvas(200, 50);
  const ctx = canvas.getContext('2d');

  // Generate random text
  const captchaText = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Draw background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  ctx.font = '30px Arial';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.fillText(captchaText, canvas.width / 2, canvas.height / 1.5);

  return { captchaText, image: canvas.toDataURL() };
};

const validateCaptcha = (inputText, actualText) => {
  return inputText === actualText;
};

module.exports = { generateCaptcha, validateCaptcha };
