/**
 * The wordmark, shared by the header and the signed-out pages so the site is
 * recognisably the same place on either side of a sign-in.
 */
export function Logo({ tone = "light" }: { tone?: "light" | "brand" }) {
  return (
    <span
      className={`flex items-center gap-2 ${
        tone === "brand" ? "text-brand" : "text-white"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="currentColor">
        <path d="M20 3c0 9-5 13-10 13a6.5 6.5 0 0 1-3.7-1.1C8 10.5 11.4 8 15 7c-4.4.3-7.9 2.6-9.8 6.6A7 7 0 0 1 4 10C4 5.6 9.6 3 20 3Z" />
        <path d="M4.5 20.8a1 1 0 0 1-1-1.6C5 17.4 6.6 16 8.4 15l1 1.7c-1.6.9-3 2-4.2 3.6a1 1 0 0 1-.7.5Z" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-base font-bold tracking-tight">PreFarm</span>
        {/* The tagline is wider than the wordmark, so it is dropped on the
            narrowest screens to keep the header's left cluster from crowding
            out the search box. */}
        <span
          className={`hidden whitespace-nowrap text-[10px] font-medium sm:block ${
            tone === "brand" ? "text-muted" : "text-white/70"
          }`}
        >
          Know your buyer before you grow
        </span>
      </span>
    </span>
  );
}
