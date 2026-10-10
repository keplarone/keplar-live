import { collection } from "./platform/store";
import type { AbuseReport, Deploy, Domain, MediaJob, Project } from "./types";

export const projects = () => collection<Project>("create_projects");
export const deploys = () => collection<Deploy>("create_deploys");
export const domains = () => collection<Domain>("create_domains");
export const mediaJobs = () => collection<MediaJob>("create_media_jobs");
export const abuseReports = () => collection<AbuseReport>("create_abuse_reports");
