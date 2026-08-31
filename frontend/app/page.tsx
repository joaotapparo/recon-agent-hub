export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-4 px-6 py-32 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          recon-agent-hub
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Painel em construcao. O formulario de submissao de dominio e o
          fluxo de triagem de achados por IA chegam nas proximas fases do
          projeto.
        </p>
      </main>
    </div>
  );
}
