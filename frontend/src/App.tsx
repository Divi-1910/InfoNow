import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import WelcomePage from "./pages/WelcomePage";
import HomePage from "./pages/HomePage";
import "./App.css";
import Loading from "./components/Loading";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await axios.get(`${BACKEND_URL}/api/user/me`, {
          withCredentials: true,
        });
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

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
            <div>Profile Page</div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
