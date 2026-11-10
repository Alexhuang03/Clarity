import Link from "next/link";

/** Marque Clarity : pastille d'accent + nom. href = lien (accueil par défaut), null = simple texte. */
export function Logo({ href = "/", className = "" }: { href?: string | null; className?: string }) {
  const content = (
    <>
      <span
        aria-hidden
        className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-[0.6rem] bg-foreground text-background"
      >
        <span className="font-display text-[1.05rem] italic leading-none">C</span>
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent blur-[3px]" />
      </span>
      <span className="font-semibold tracking-tight">Clarity</span>
    </>
  );
  const classes = `inline-flex items-center gap-2.5 ${className}`;
  if (href === null) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
