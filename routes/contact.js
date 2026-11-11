import { Router } from "express";
import { Resend } from "resend";

const router = Router();

const resendApiKey = process.env.RESEND_API_KEY;
let resend = null;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
}

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "shanky.cr7@gmail.com";
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (!resend) {
      return res.status(500).json({ error: "Email service not configured (RESEND_API_KEY missing)" });
    }

    const { data, error } = await resend.emails.send({
      from: `Satta-Samrat Contact <${FROM_EMAIL}>`,
      to: [TO_EMAIL],
      subject: `New Contact Form Message from ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name.replace(/</g, "&lt;")}</p>
        <p><strong>Email:</strong> ${email.replace(/</g, "&lt;")}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="border-left: 4px solid #ccc; padding-left: 12px; margin-left: 0; color: #333;">
          ${message.replace(/</g, "&lt;").replace(/\n/g, "<br>")}
        </blockquote>
        <hr>
        <p style="color: #888; font-size: 12px;">Sent from Satta-Samrat contact form</p>
      `,
      replyTo: email,
    });

    if (error) {
      console.error("[Contact] Resend error:", error);
      return res.status(500).json({ error: "Failed to send email. Please try again later." });
    }

    console.log("[Contact] Email sent:", data?.id);
    res.json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("[Contact] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
