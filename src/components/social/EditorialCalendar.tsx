import {
  addDays,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  editorialDate,
  formatLabels,
  statusLabels,
  type SocialPost,
} from "@/lib/social";
import { publicationLabels, type Publication } from "@/lib/social-publishing";
export function EditorialCalendar({
  month,
  posts,
  onSelect,
  jobs = [],
}: {
  month: Date;
  posts: SocialPost[];
  onSelect: (post: SocialPost) => void;
  jobs?: Publication[];
}) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const length =
    Math.ceil(
      (endOfMonth(month).getDate() + ((startOfMonth(month).getDay() + 6) % 7)) /
        7,
    ) * 7;
  const today = editorialDate(new Date().toISOString());
  const byDay = new Map<string, SocialPost[]>();
  for (const post of posts) {
    const date = editorialDate(post.scheduled_at);
    byDay.set(date, [...(byDay.get(date) || []), post]);
  }
  return (
    <div className="rounded-2xl border bg-card overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
            <div
              key={day}
              className="p-3 text-xs font-semibold text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length }, (_, i) => {
            const date = addDays(start, i),
              key = format(date, "yyyy-MM-dd");
            return (
              <div
                key={key}
                className={
                  "min-h-36 p-2 border-r border-b " +
                  (date.getMonth() !== month.getMonth()
                    ? "bg-muted/20 opacity-60"
                    : "")
                }
              >
                <span
                  className={
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs mb-2 " +
                    (key === today
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground")
                  }
                >
                  {date.getDate()}
                </span>
                <div className="space-y-1">
                  {(byDay.get(key) || []).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => onSelect(post)}
                      className="block text-left w-full rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 p-2 focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="text-[9px] uppercase tracking-wider text-primary">
                        {formatLabels[post.format]} ·{" "}
                        {jobs.find((j) => j.post_id === post.id)
                          ? publicationLabels[
                              jobs.find((j) => j.post_id === post.id)!.status
                            ]
                          : statusLabels[post.status]}
                      </span>
                      <span className="block text-xs font-semibold line-clamp-2 mt-1">
                        {post.title}
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-1">
                        {new Date(post.scheduled_at!).toLocaleTimeString(
                          "pt-BR",
                          {
                            timeZone: "America/Sao_Paulo",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
