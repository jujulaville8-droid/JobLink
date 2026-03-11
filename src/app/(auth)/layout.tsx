export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-block">
            <span className="text-3xl font-bold text-[#0d7377]">
              Job<span className="text-[#14919b]">Link</span>
            </span>
          </a>
        </div>
        {children}
      </div>
    </div>
  )
}
