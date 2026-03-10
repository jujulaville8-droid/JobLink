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
            <span className="text-3xl font-bold text-[#1e3a5f]">
              Job<span className="text-[#e85d26]">Link</span>
            </span>
          </a>
        </div>
        {children}
      </div>
    </div>
  )
}
