import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-4 text-center">
      <h1 className="text-4xl font-bold font-mono text-indigo-400 mb-2">404</h1>
      <p className="text-sm text-zinc-400 mb-6">Page not found</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
      >
        Return to Assistant
      </Link>
    </div>
  );
}
