import { Resend } from 'resend';
import { config } from '@/config';
import { logger } from '@/utils/logger';

let resend: Resend | null = null;
let resendSecret: string | null = null;

function getResendClient(): Resend {
    if (!resend || resendSecret !== config.email.resendSecret) {
        resendSecret = config.email.resendSecret;
        resend = new Resend(resendSecret);
    }
    return resend;
}

interface SendEmailParams {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    from?: string;
}

export async function sendEmail({ to, subject, html, text, from }: SendEmailParams) {
    try {
        const fromAddress = from || config.email.defaultSender || 'onboarding@resend.dev';
        const { data, error } = await getResendClient().emails.send({
            from: fromAddress,
            to,
            subject,
            html: html || '',
            text: text || ''
        });

        if (error) {
            logger.error('Failed to send email: ', error);
            return { success: false, error };
        }
        logger.info(`Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to}`);
        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err };
    }
}
