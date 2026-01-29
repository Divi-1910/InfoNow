import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axiosInstance from "./lib/axios";
import { useSetAtom } from "jotai";
import { userAtom } from "./store/userAtom";
import WelcomePage from "./pages/WelcomePage";
import HomePage from "./pages/HomePage";
import ProfilePage from "./pages/ProfilePage";
import "./App.css";
import Loading from "./components/Loading";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const setUser = useSetAtom(userAtom);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axiosInstance.get("/api/user/me");
        setUser(response.data.user);
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, [setUser]);

  if (isAuthenticated === null) {
    return <Loading />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
