import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { BoardPage } from './board/BoardPage';
import { ToastHost } from './components/Toast';
import { appName, appTagline, isAllowedEmail } from './config';
import { saveMyProfile } from './data/users';
import { t, useLang } from './i18n';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const { user, ready } = useAuth();
  // 表示の言語に合わせて、ページの言語とタブの名前を変える
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${appName}${lang === 'ja' ? '｜' : ' | '}${appTagline(lang)}`;
  }, [lang]);
  // 画面側の判定は案内のため。実際のアクセス制限はセキュリティルールで行う。
  const allowed = !!user && isAllowedEmail(user.email) && user.emailVerified;
  // ログインしたら、招待の候補に出せるよう自分の名前などを記録する（失敗しても使うのには困らない）
  useEffect(() => {
    if (allowed && user) saveMyProfile(user).catch(console.error);
  }, [allowed, user]);
  if (!ready) return <div className="center-message">{t('common.loading')}</div>;
  return (
    <BrowserRouter>
      {allowed ? (
        <Routes>
          <Route path="/" element={<HistoryPage />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <LoginPage />
      )}
      <ToastHost />
    </BrowserRouter>
  );
}
