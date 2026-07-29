const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_URL = 'https://res.cloudinary.com/dtr1shkje/image/upload/v1778498707/pickar/profiles/quylm9vevusl0lj2i71q.jpg';

const buildOTPEmailHtml = (otp, name) => `
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#F4F4F4; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F4; padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:16px; overflow:hidden; border:1px solid #F0E6E6;">

            <!-- Header / Logo band -->
            <tr>
              <td align="center" style="background-color:#8B1538; padding: 32px 24px;">
                <img src="${LOGO_URL}" alt="Pickar" height="36" style="display:block;" />
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 40px 40px 24px 40px;">
                <h1 style="margin:0 0 20px 0; font-size:26px; line-height:1.3; color:#1F2937; font-weight:700;">
                  Welcome, ${name} 📦
                </h1>
                <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#4B5563;">
                  Thanks for signing up with Pickar. You're one step away from fast, reliable package delivery across Lagos — enter the code below to verify your email and activate your account.
                </p>
              </td>
            </tr>

            <!-- OTP block -->
            <tr>
              <td align="center" style="padding: 8px 40px 32px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#FEFAFA; border:1.5px solid #8B1538; border-radius:12px; width:100%;">
                  <tr>
                    <td align="center" style="padding: 24px;">
                      <span style="display:block; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#8B1538; margin-bottom:10px;">
                        Your verification code
                      </span>
                      <span style="display:block; font-size:38px; font-weight:800; letter-spacing:10px; color:#1F2937;">
                        ${otp}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Expiry notice -->
            <tr>
              <td style="padding: 0 40px 32px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FEF9EC; border:1px solid #F3E4B8; border-radius:10px;">
                  <tr>
                    <td style="padding: 16px 18px; font-size:13px; line-height:1.6; color:#8A6D1F;">
                      ⏱️ This code expires in <strong>10 minutes</strong>. If you didn't create a Pickar account, you can safely ignore this email.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 0 40px 32px 40px; border-top:1px solid #F0F0F0;">
                <p style="margin: 24px 0 0 0; font-size:13px; line-height:1.6; color:#9CA3AF;">
                  Best,<br/>The Pickar Team
                </p>
              </td>
            </tr>

          </table>

          <p style="margin: 20px 0 0 0; font-size:12px; color:#B0B0B0; text-align:center;">
            Pickar · Lagos, Nigeria
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const sendOTPEmail = async (email, otp, name) => {
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Pickar <onboarding@resend.dev>',
    to: email,
    subject: 'Pickar - Email Verification',
    html: buildOTPEmailHtml(otp, name),
  });

  if (error) {
    throw new Error(error.message || 'Failed to send OTP email');
  }
};

module.exports = { sendOTPEmail };