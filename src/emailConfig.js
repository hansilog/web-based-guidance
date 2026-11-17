// EmailJS account used for every email the app sends (emailjs.com).
// To move to another account, change these four values only.
export const EMAIL_PUBLIC_KEY = "emBhN_hYfduMikhDz"; // Account > General > Public Key
export const EMAIL_SERVICE = "service_jwm1vwr"; // Email Services > the Gmail service
export const EMAIL_TEMPLATE = "template_gvffmtb"; // Appointment updates and reminders
// Password-reset codes (only used without Supabase; Supabase sends its own reset
// links). Not set up in this account yet: create a template with {{to_email}}
// and {{otp}} and put its ID here.
export const EMAIL_CODE_TEMPLATE = "template_gbmoria";
