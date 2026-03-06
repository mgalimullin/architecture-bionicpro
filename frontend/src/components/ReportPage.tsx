import React, { useState } from 'react';

const ReportPage: React.FC = () => {
  console.log("AUTH URL:", process.env.REACT_APP_AUTH_URL);
  console.log("API URL:", process.env.REACT_APP_API_URL);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);

  const downloadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("📤 Requesting report...");

      const response = await fetch(
        `http://localhost:4000/reports`,
        {
          method: "GET",
          credentials: "include"
        }
      );

      console.log("📥 Response status:", response.status);

      if (response.status === 401) {
        window.location.href = `http://localhost:4000/login`;
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      /* 1️⃣ получаем ссылку на CDN */
      const data = await response.json();

      console.log("CDN URL:", data.url);

      /* 2️⃣ скачиваем отчёт */
      const reportResponse = await fetch(data.url);

      if (!reportResponse.ok) {
        throw new Error("Failed to load report from CDN");
      }

      const reportData = await reportResponse.json();

      console.log("✅ Report data:", reportData);

      /* 3️⃣ сохраняем отчёт */
      setReport(reportData);

    } catch (err) {
      console.error("❌ Report error:", err);
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    console.log("🔐 Redirecting to login...");
    window.location.href =
      `http://localhost:4000/login`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>

        <button
          onClick={downloadReport}
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Generating Report...' : 'Download Report'}
        </button>

        <button
          onClick={login}
          className="ml-4 px-4 py-2 bg-green-500 text-white rounded"
        >
          Login
        </button>

        {/* ✅ вывод отчёта */}
        {report && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <p><strong>Orders:</strong> {report.orders_count}</p>
            <p><strong>Total:</strong> {report.total_sum}</p>
            <p><strong>Discount:</strong> {report.total_discount}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;