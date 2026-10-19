export const categories = ["Community", "Music", "Food & drink", "Arts & culture", "Outdoors", "Tech & ideas"] as const;
export const themes = ["cobalt", "citrus", "rose", "lilac", "forest", "peach"] as const;
export type EventItem = {
  id: string; title: string; description: string; category: string; venue: string; city: string;
  startsAt: string; endsAt: string; timezone: string; capacity: number; theme: string;
  hostName: string; status: string; attending: number; isHost: boolean; isGoing: boolean; sample?: boolean;
};
export type Viewer = { displayName: string; email: string } | null;
