// Utility service for sending emails via Nodemailer
const nodemailer = require('nodemailer');
const AppError = require('../utils/AppError');

// Diagnostic: Log environment variable status (without revealing secrets)
const logEnvStatus = () => {
    console.log('[EMAIL DIAG] Environment Variables:');
    console.log('  SMTP_HOST:', process.env.SMTP_HOST ? '✓ Set' : '✗ MISSING');
    console.log('  SMTP_PORT:', process.env.SMTP_PORT ? `✓ Set (${process.env.SMTP_PORT})` : '✗ MISSING');
    console.log('  SMTP_USER:', process.env.SMTP_USER ? '✓ Set' : '✗ MISSING');
    console.log('  SMTP_PASS:', process.env.SMTP_PASS ? '✓ Set' : '✗ MISSING');
    console.log('  EMAIL_FROM:', process.env.EMAIL_FROM ? `✓ Set (${process.env.EMAIL_FROM})` : '✗ MISSING');
    console.log('  DEV_OTP_CONSOLE:', process.env.DEV_OTP_CONSOLE || 'Not set');
};

const sendEmail = async (to, subject, text, otp = null, traceContext = {}) => {
    const { otpTraceId = `email:${to}:${Date.now()}`, flow = 'generic' } = traceContext;
    console.log('[OTP TRACE] Email service invoked:', {
        otpTraceId,
        flow,
        to,
        subject,
        textLength: text ? text.length : 0,
        hasOtp: !!otp
    });
    console.log(`[OTP] Attempting to send email via transporter`);
    logEnvStatus();

    try {
        // Create Transporter (Brevo SMTP)

        console.log("🚨 SMTP CONFIG USED:", {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER
        });

        console.log('[EMAIL DIAG] Creating Nodemailer transporter...');
        console.log('[OTP TRACE] Building transporter for OTP mail:', {
            otpTraceId,
            flow,
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false
        });
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT, // 587
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        try {
            console.log('[OTP TRACE] Starting transporter.verify():', { otpTraceId, flow });
            await transporter.verify();
            console.log("✅ SMTP connection successful");
            console.log('[OTP TRACE] transporter.verify() succeeded:', { otpTraceId, flow });
        } catch (err) {
            console.error("❌ SMTP connection failed:", err.message);
            console.error('[OTP TRACE] transporter.verify() failed:', {
                otpTraceId,
                flow,
                name: err.name,
                message: err.message,
                code: err.code,
                command: err.command
            });
        }

        console.log('[EMAIL DIAG] Transporter created successfully');

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to,
            subject,
            text
        };
        console.log('[OTP TRACE] Mail options prepared:', {
            otpTraceId,
            flow,
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });

        console.log(`[EMAIL DIAG] Sending email to: ${to}`);
        console.log(`[EMAIL DIAG] Subject: ${subject}`);
        console.log('[OTP TRACE] Starting transporter.sendMail():', { otpTraceId, flow });

        const info = await transporter.sendMail(mailOptions);

        console.log(`[EMAIL SUCCESS] Message ID: ${info.messageId}`);
        console.log(`[EMAIL SUCCESS] Response: ${info.response}`);
        console.log(`[EMAIL SUCCESS] Accepted: ${info.accepted}`);
        console.log(`[EMAIL SUCCESS] Rejected: ${info.rejected}`);
        console.log('[OTP TRACE] transporter.sendMail() succeeded:', {
            otpTraceId,
            flow,
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });

        return info;
    } catch (error) {
        if (error instanceof AppError) throw error;

        console.error('[OTP TRACE] transporter.sendMail() failed:', {
            otpTraceId,
            flow,
            name: error.name,
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response,
            responseCode: error.responseCode
        });
        console.error('[EMAIL ERROR] Full error object:', error);
        console.error('[EMAIL ERROR] Error name:', error.name);
        console.error('[EMAIL ERROR] Error message:', error.message);
        console.error('[EMAIL ERROR] Error code:', error.code);
        console.error('[EMAIL ERROR] Error response:', error.response);
        console.error('[EMAIL ERROR] SMTP Response Code:', error.responseCode);

        // DEV_OTP_CONSOLE fallback on error ONLY
        if (process.env.DEV_OTP_CONSOLE === 'true' && otp) {
            console.log(`\n[DEV OTP FALLBACK] Email failed! OTP for ${to} is: ${otp}\n`);
        }

        return null;
    }
};

module.exports = { sendEmail };
