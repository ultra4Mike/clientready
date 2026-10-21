/** R92: the fixed crew-invite text (app email and the mailto fallback use the same words). */
export function inviteText(business: string, name: string, origin: string, email: string) {
  const biz = business.trim() || "Your team";
  return {
    subject: `${biz} added you to ClientReady`,
    text: `Hi ${(name || "").trim().split(/\s+/)[0] || "there"},\n\n${biz} added you to their crew on ClientReady, so you can see your jobs, clock in and mark jobs done.\n\nSet up your login with this email (${email}):\n${origin}/signup?crew=1\n\nAlready have a password? Log in here: ${origin}/login\n\n${biz}`,
  };
}

