import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY?.trim();
const defaultFrom = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";

export const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

/**
 * Sends a transactional email using Resend.
 * Returns { success: boolean, id?: string, error?: string }
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = defaultFrom,
}: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY is not configured. Email skipped for:", to);
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const recipients = Array.isArray(to) ? to : [to];
    const { data, error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
      text: text ?? html.replace(/<[^>]*>/g, " "),
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Email] Failed to send email:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Sends a welcome email to newly registered users.
 */
export async function sendWelcomeEmail(to: string, name?: string) {
  const displayName = name?.trim() || "Traveler";
  return sendEmail({
    to,
    subject: "Welcome to India Travel Planner! ✈️",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">Welcome aboard, ${displayName}! 🇮🇳</h1>
        <p style="font-size: 16px; line-height: 1.6; color: #475569;">
          Thank you for joining India Travel Planner. You can now craft personalized, multi-day itineraries, discover heritage sites, optimize your routes, and save all your journeys in one place.
        </p>
        <div style="margin: 32px 0;">
          <a href="http://localhost:5173" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block;">
            Start Planning Your Trip
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 13px; color: #94a3b8;">
          India Travel Planner &bull; Handcrafted itineraries across India
        </p>
      </div>
    `,
  });
}

/**
 * Sends a password reset email with a token link.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string, name?: string) {
  const displayName = name?.trim() || "Traveler";
  return sendEmail({
    to,
    subject: "Reset your India Travel Planner password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; font-size: 22px; margin-bottom: 16px;">Password Reset Request</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #475569;">
          Hello ${displayName}, we received a request to reset the password for your India Travel Planner account.
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #475569;">
          Click the button below to choose a new password. This link is valid for 1 hour.
        </p>
        <div style="margin: 28px 0;">
          <a href="${resetUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
