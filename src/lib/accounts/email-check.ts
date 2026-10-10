/** The API error for an email address whose domain can't receive mail (shared by every endpoint that sends email). */
import { APIError } from "better-auth/api";
import { NO_MAIL_MESSAGE } from "./email-domain";
import { suggestEmail } from "./email-typos";

export function badMailDomain(email: string) {
  const hint = suggestEmail(email);
  return new APIError("BAD_REQUEST", { message: hint ? `${NO_MAIL_MESSAGE} Did you mean ${hint}?` : NO_MAIL_MESSAGE, code: "EMAIL_DOMAIN" });
}
