import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ScreeningProvider } from './contexts/ScreeningContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewScreeningPage from './pages/NewScreeningPage';
import CapturePage from './pages/CapturePage';
import QualityPage from './pages/QualityPage';
import AnalyzePage from './pages/AnalyzePage';
import ResultPage from './pages/ResultPage';
import ExplainPage from './pages/ExplainPage';
import ReviewPage from './pages/ReviewPage';
import ReportPage from './pages/ReportPage';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import HistoryPage from './pages/HistoryPage';
import ScreeningDetailPage from './pages/ScreeningDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import SystemStatusPage from './pages/SystemStatusPage';
import SettingsPage from './pages/SettingsPage';
import ReportsListPage from './pages/ReportsListPage';
import LongitudinalPage from './pages/LongitudinalPage';
import PatientLongitudinalHistoryPage from './pages/PatientLongitudinalHistoryPage';

export default function App() {
  return (
    <AuthProvider>
      <ScreeningProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/screening/new" element={<NewScreeningPage />} />
                  <Route path="/screening/capture" element={<CapturePage />} />
                  <Route path="/screening/quality" element={<Navigate to="/screening/capture" replace />} />
                  <Route path="/screening/analyze" element={<AnalyzePage />} />
                  <Route path="/screening/result" element={<ResultPage />} />
                  <Route path="/screening/explain" element={<ExplainPage />} />
                  <Route path="/screening/review" element={<ReviewPage />} />
                  <Route path="/screening/report" element={<ReportPage />} />
                  <Route path="/review/queue" element={
                    <ProtectedRoute requireDoctor>
                      <ReviewQueuePage />
                    </ProtectedRoute>
                  } />
                  <Route path="/patients" element={<PatientsPage />} />
                  <Route path="/patients/records" element={<PatientsPage />} />
                  <Route path="/patients/:id" element={<PatientDetailPage />} />
                  <Route path="/patients/:id/history" element={<PatientLongitudinalHistoryPage />} />
                  <Route path="/comparison/:id" element={<LongitudinalPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/screening/history" element={<HistoryPage />} />
                  <Route path="/history/:id" element={<ScreeningDetailPage />} />
                  <Route path="/screening/:id" element={<ScreeningDetailPage />} />
                  <Route path="/reports" element={<ReportsListPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/system" element={<SystemStatusPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<div className="empty"><h2>Page not found</h2></div>} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </ScreeningProvider>
    </AuthProvider>
  );
}
