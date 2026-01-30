"use client";

const NotFoundPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-linear-to-br from-[#f5f7fa] to-[#c3cfe2]">
      {/* Logo placeholder */}
      <div className="text-6xl mb-6">📚</div>

      <div className="p-6 w-full max-w-md rounded-lg shadow-md text-center bg-white/80 backdrop-blur-sm">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">Not Found</h1>
        <p className="text-red-600 mb-6">Could not find requested page</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-6 py-3 bg-linear-to-br from-[#667eea] to-[#764ba2] text-white font-semibold rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
        >
          Back To Home
        </button>
      </div>
    </div>
  );
};

export default NotFoundPage;
