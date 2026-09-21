const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function unauthorized(res, message) {
  return res.status(401).json({ error: message || "Unauthorized" });
}

function verifyToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const payloadString = parts[0];
  const received = parts[1];
  const expected = crypto.createHmac("sha256", secret).update(payloadString).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadString, "base64url").toString("utf8"));
    // null expires_at means lifetime access. Otherwise enforce the expiry timestamp.
    if (payload.expires_at !== null && (!payload.expires_at || Date.now() > Number(payload.expires_at))) return null;
    return payload;
  } catch { return null; }
}

function loadBook() {
  const file = path.join(process.cwd(), "protected-book.dat");
  const data = fs.readFileSync(file);
  if (data.subarray(0, 4).toString() !== "KKB1") throw new Error("Invalid book data");
  const headerLen = data.readUInt32BE(4);
  const header = JSON.parse(data.subarray(8, 8 + headerLen).toString("utf8"));
  return { data, header, dataStart: 8 + headerLen };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://amarjais-ai.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { access_token, page } = req.body || {};
    const secret = process.env.EBOOK_ACCESS_SECRET;
    const bookKey = process.env.EBOOK_BOOK_KEY;
    if (!secret || !bookKey) return res.status(500).json({ error: "Protected reader is not configured" });

    const payload = verifyToken(access_token, secret);
    if (!payload) return unauthorized(res, "Invalid or expired access");

    const pageNumber = Number(page);
    const book = loadBook();
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > book.header.pages.length) {
      return res.status(400).json({ error: "Invalid page" });
    }

    let key = Buffer.from(bookKey, "base64url");
    if (key.length !== 32) return res.status(500).json({ error: "Invalid book key" });

    const p = book.header.pages[pageNumber - 1];
    const encrypted = book.data.subarray(book.dataStart + p.o, book.dataStart + p.o + p.l);
    const nonce = Buffer.from(p.n, "base64url");
    const tag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    const image = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", String(image.length));
    return res.status(200).send(image);
  } catch (error) {
    console.error("Protected page error:", error);
    return res.status(500).json({ error: "Unable to load e-book page" });
  }
};
