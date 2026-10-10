/** Plain-language agreement line for shared pages and their preview cards. Pure, so tests and the OG route can use it. */
export const agreementLine = (l: string, agree: number, disagree: number, responded: number, consulted: number) => {
  if (l === "single") return "Answered by one model, so there was nothing to compare.";
  if (l === "unscored") return `${responded} of ${consulted} models responded.`;
  if (l === "none") return `The models did not reach a majority (${responded} of ${consulted} responded).`;
  return `${agree} of ${agree + disagree} models that answered took the same position${disagree ? `; ${disagree} did not` : ""}. ${responded} of ${consulted} responded.`;
};
