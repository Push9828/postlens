import { EvaluationWorkspace } from "@/features/evaluation/ui/evaluation-workspace";
import { ThemeToggle } from "@/features/theme/ui/theme-toggle";

export default function Home() {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <a
            href="#main-content"
            className="text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]"
          >
            PostLens
          </a>
          <div className="flex items-center gap-4">
            <p className="hidden text-sm text-[var(--text-subtle)] sm:block">
              A transparent rubric for LinkedIn drafts
            </p>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16"
      >
        <section className="mb-9 max-w-3xl sm:mb-12">
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
            Know what is weak before you publish.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--text-muted)]">
            See how your draft holds up against eight clear dimensions before
            you publish.
          </p>
        </section>

        <EvaluationWorkspace />
      </main>
    </div>
  );
}
