import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
} from "framer-motion";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Sparkles, TrendingUp, Zap, ChevronDown } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import newsVideo from "../assets/news_network.mp4";
import { handleGoogleLoginSuccess } from "../api/auth";

gsap.registerPlugin(ScrollTrigger);

const WelcomePage = () => {
  const navigate = useNavigate();
  const [currentImage, setCurrentImage] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.8, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const imageOpacity = useTransform(scrollYProgress, [0, 0.8], [0.3, 0]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -100]);

  const images = [
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
    "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&q=80",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".gsap-fade-up").forEach((elem: any) => {
        gsap.from(elem, {
          y: 100,
          opacity: 0,
          duration: 1.2,
          ease: "power3.out",
          scrollTrigger: {
            trigger: elem,
            start: "top 85%",
            end: "top 50%",
            scrub: 1,
          },
        });
      });

      gsap.utils.toArray(".gsap-scale").forEach((elem: any) => {
        gsap.from(elem, {
          scale: 0.8,
          opacity: 0,
          duration: 1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: elem,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        });
      });

      gsap.utils.toArray(".gsap-parallax").forEach((elem: any) => {
        gsap.to(elem, {
          y: -150,
          ease: "none",
          scrollTrigger: {
            trigger: elem,
            start: "top bottom",
            end: "bottom top",
            scrub: 1.5,
          },
        });
      });
    });

    return () => ctx.revert();
  }, []);

  const handleLoginSuccess = async (credentialResponse: CredentialResponse) => {
    const data = await handleGoogleLoginSuccess(credentialResponse);
    console.log("Google Login Success:", data.message);
    navigate(data.redirect);
  };

  const handleLoginError = () => {
    console.log("Login Failed");
  };

  return (
    <div className="bg-black text-white">
      {/* Hero Section */}
      <div ref={heroRef} className="grid lg:grid-cols-2 min-h-screen relative">
        <motion.div
          className="relative hidden lg:block overflow-hidden bg-zinc-950"
          style={{ opacity: heroOpacity }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentImage}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 2, ease: "easeInOut" }}
              style={{ opacity: imageOpacity, scale: imageScale }}
              className="absolute inset-0"
            >
              <img
                src={images[currentImage]}
                alt="Intelligence"
                className="w-full h-full object-cover"
              />
            </motion.div>
          </AnimatePresence>

          <div className="absolute inset-0 bg-gradient-to-br from-black via-black/60 to-transparent" />

          <motion.div
            className="absolute inset-0 flex flex-col justify-between p-12 z-10"
            style={{ y: contentY }}
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-5xl font-light mb-2">InfoNow</h2>
              <div className="h-[1px] w-16 bg-white/40" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="space-y-8"
            >
              <motion.h3
                className="text-3xl font-light leading-tight max-w-lg"
                style={{
                  opacity: useTransform(scrollYProgress, [0, 0.3], [1, 0]),
                }}
              >
                Your personalized intelligence platform
              </motion.h3>

              <motion.div
                className="space-y-4 max-w-md"
                style={{
                  opacity: useTransform(scrollYProgress, [0.1, 0.4], [1, 0]),
                }}
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 mt-1 text-gray-400" />
                  <p className="text-sm text-gray-300">
                    AI-powered insights from multiple sources
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 mt-1 text-gray-400" />
                  <p className="text-sm text-gray-300">
                    Real-time news, trends, and conversations
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 mt-1 text-gray-400" />
                  <p className="text-sm text-gray-300">
                    Unified feed from Reddit, YouTube, News & more
                  </p>
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              className="flex gap-2"
              style={{
                opacity: useTransform(scrollYProgress, [0, 0.3], [1, 0]),
              }}
            >
              {images.map((_, idx) => (
                <button
                  title="image"
                  key={idx}
                  onClick={() => setCurrentImage(idx)}
                  className={`h-[2px] transition-all duration-500 ${
                    idx === currentImage ? "w-12 bg-white" : "w-6 bg-white/30"
                  }`}
                />
              ))}
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div
          className="flex items-center justify-center p-8 bg-black relative"
          style={{ opacity: heroOpacity, scale: heroScale }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md"
          >
            <div className="mb-12">
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-5xl font-light mb-3 tracking-tight"
              >
                InfoNow
              </motion.h1>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "60px" }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="h-[1px] bg-white"
              />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-2xl font-light mb-2">Welcome</h2>
                <p className="text-white font-light text-sm">
                  Stop searching. Start understanding.
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="pt-4"
              >
                <GoogleLogin
                  onSuccess={handleLoginSuccess}
                  onError={handleLoginError}
                  theme="filled_black"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="pt-8"
              >
                <div className="grid grid-cols-3 gap-6 text-center border-t border-zinc-900 pt-8">
                  <div>
                    <div className="text-2xl font-light mb-1">100+</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wider">
                      Sources
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-light mb-1">Real-time</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wider">
                      Updates
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-light mb-1">AI</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wider">
                      Powered
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="text-xs text-gray-700 text-center pt-8"
              >
                By continuing, you agree to our Terms of Service and Privacy
                Policy
              </motion.p>
            </motion.div>
          </motion.div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            style={{ opacity: useTransform(scrollYProgress, [0, 0.3], [1, 0]) }}
            onClick={() =>
              document
                .getElementById("calm")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600 hover:text-gray-400 transition-colors"
          >
            <span className="text-xs uppercase tracking-wider">Learn More</span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <ChevronDown className="w-5 h-5" />
            </motion.div>
          </motion.button>
        </motion.div>
      </div>

      {/* About Section */}
      <AboutSection />

      {/* Philosophy Sections */}
      <PhilosophySection
        id="calm"
        word="Calm"
        phrase="Not consuming news."
        reveal="Understanding it."
        description="No endless scrolling. No noise. Just clarity."
        image="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=80"
      />

      <PhilosophySection
        id="smart"
        word="Smart"
        phrase="Not searching everywhere."
        reveal="Finding instantly."
        description="AI that thinks with you. Real-time answers from every source."
        image="https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&q=80"
      />

      <PhilosophySection
        id="fast"
        word="Fast"
        phrase="Not switching apps."
        reveal="One unified feed."
        description="News. Reddit. YouTube. Wikipedia. All in one place."
        image="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&q=80"
      />

      <PhilosophySection
        id="simple"
        word="Simple"
        phrase="Not overwhelming."
        reveal="Empowering."
        description="Clean interface. Powerful intelligence. Your personalized universe."
        image="https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1600&q=80"
      />

      {/* Final CTA */}
      <FinalCTASection />
    </div>
  );
};

const AboutSection = () => {
  return (
    <section className="relative min-h-screen bg-zinc-900 flex items-center justify-center py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-transparent to-zinc-950 z-30 pointer-events-none" />
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-transparent to-zinc-900 z-10" />
        <div className="absolute inset-0 gsap-parallax">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-50"
            src={newsVideo}
          />
        </div>
      </div>

      <div className="relative z-20 max-w-6xl mx-auto">
        <div className="text-center mb-24 gsap-fade-up">
          <h2 className="text-6xl md:text-8xl font-sans tracking-tight text-gray-300 mb-4">
            Stop searching.
          </h2>
          <h2 className="text-6xl md:text-8xl font-extralight tracking-tight mb-16">
            <span className="text-gray-300">Start</span>{" "}
            <span className="text-white">understanding.</span>
          </h2>
          <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-white/40 to-transparent mx-auto" />
        </div>

        <div className="text-center mb-24 gsap-fade-up">
          <p className="text-2xl md:text-3xl text-gray-300 font-light leading-relaxed max-w-4xl mx-auto">
            InfoNow is your{" "}
            <span className="text-white font-normal">thinking interface</span>{" "}
            for the world.
            <br className="hidden md:block" />
            We combine live feeds with AI that{" "}
            <span className="text-white font-normal">
              explains, compares, and connects.
            </span>
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            {
              title: "One Feed",
              desc: "News • Reddit • YouTube • Wikipedia",
              num: "01",
            },
            {
              title: "Zero Noise",
              desc: "Personalized • Curated • Real-time",
              num: "02",
            },
            {
              title: "Full Context",
              desc: "AI Analysis • Sources • Timeline",
              num: "03",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="gsap-scale group relative bg-white/[0.1] backdrop-blur-sm border border-white/10 rounded-3xl p-10 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 cursor-pointer"
            >
              <div className="text-6xl font-extralight text-white/20 mb-6 group-hover:text-white/30 transition-colors">
                {item.num}
              </div>
              <h3 className="text-3xl font-light text-white mb-4 tracking-tight">
                {item.title}
              </h3>
              <div className="h-[1px] w-12 bg-gradient-to-r from-white/30 to-transparent mb-6 group-hover:w-20 transition-all duration-500" />
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const PhilosophySection = ({
  id,
  word,
  phrase,
  reveal,
  description,
  image,
}: {
  id: string;
  word: string;
  phrase: string;
  reveal: string;
  description: string;
  image: string;
}) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const imageScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.3, 1, 1.3]);
  const imageOpacity = useTransform(
    scrollYProgress,
    [0, 0.3, 0.7, 1],
    [0, 0.35, 0.35, 0]
  );
  const imageY = useTransform(scrollYProgress, [0, 1], [50, -50]);

  const wordOpacity = useTransform(
    scrollYProgress,
    [0.2, 0.35, 0.65, 0.8],
    [0, 1, 1, 0]
  );
  const wordScale = useTransform(scrollYProgress, [0.2, 0.35], [0.8, 1]);

  const phraseOpacity = useTransform(
    scrollYProgress,
    [0.3, 0.4, 0.6, 0.7],
    [0, 1, 1, 0]
  );
  const phraseY = useTransform(scrollYProgress, [0.3, 0.4], [30, 0]);

  const revealOpacity = useTransform(
    scrollYProgress,
    [0.4, 0.5, 0.6, 0.7],
    [0, 1, 1, 0]
  );
  const revealY = useTransform(scrollYProgress, [0.4, 0.5], [30, 0]);

  const descOpacity = useTransform(
    scrollYProgress,
    [0.5, 0.6, 0.65, 0.75],
    [0, 1, 1, 0]
  );

  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative h-[150vh] flex items-center justify-center overflow-hidden bg-zinc-900"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-transparent to-zinc-950 z-30 pointer-events-none" />
      <motion.div
        className="absolute inset-0 z-0"
        style={{ scale: imageScale, opacity: imageOpacity, y: imageY }}
      >
        <div className="absolute inset-0 bg-zinc-900/40 z-10" />
        <img
          src={image}
          alt={word}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </motion.div>

      <div className="z-20 max-w-5xl mx-auto px-6 text-center sticky top-1/2 -translate-y-1/2">
        <motion.div
          style={{ opacity: wordOpacity, scale: wordScale }}
          className="mb-16"
        >
          <h2 className="text-8xl md:text-9xl font-extralight tracking-tight text-white/90">
            {word}
          </h2>
        </motion.div>

        <motion.div
          style={{ opacity: phraseOpacity, y: phraseY }}
          className="mb-4"
        >
          <p className="text-3xl md:text-4xl font-light text-gray-400 line-through decoration-gray-600">
            {phrase}
          </p>
        </motion.div>

        <motion.div
          style={{ opacity: revealOpacity, y: revealY }}
          className="mb-12"
        >
          <p className="text-4xl md:text-5xl font-light text-white">{reveal}</p>
        </motion.div>

        <motion.div style={{ opacity: descOpacity }}>
          <div className="h-[1px] w-24 bg-white/20 mx-auto mb-6" />
          <p className="text-lg md:text-xl text-gray-500 font-light max-w-2xl mx-auto">
            {description}
          </p>
        </motion.div>
      </div>
    </section>
  );
};

const FinalCTASection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const bgOpacity = useTransform(
    scrollYProgress,
    [0, 0.3, 0.7, 1],
    [0, 0.45, 0.45, 0]
  );
  const bgScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.2, 1, 1.2]);
  const bgY = useTransform(scrollYProgress, [0, 1], [100, -100]);

  return (
    <section
      ref={sectionRef}
      className="relative z-50 h-screen bg-zinc-950 flex items-center justify-center px-6 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-transparent to-zinc-900 z-30 pointer-events-none" />
      <motion.div
        className="absolute inset-0 z-0"
        style={{ opacity: bgOpacity, scale: bgScale, y: bgY }}
      >
        <div className="absolute inset-0 bg-zinc-900/40 z-10" />
        <img
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=80"
          alt="Begin Journey"
          className="w-full h-full object-cover"
        />
      </motion.div>

      <motion.div
        animate={{ y: [0, -20, 0], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-20 left-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ y: [0, 20, 0], opacity: [0.3, 0.5, 0.3] }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-20 right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl"
      />

      <div className="relative z-20 text-center max-w-5xl gsap-fade-up">
        <div className="mb-16">
          <p className="text-2xl md:text-3xl font-light text-gray-500 mb-6">
            I'm not consuming news.
          </p>
          <h2 className="text-6xl md:text-8xl font-extralight text-white mb-8">
            I'm understanding it.
          </h2>
          <div className="h-[1px] w-40 bg-gradient-to-r from-transparent via-white/40 to-transparent mx-auto" />
        </div>

        <div className="space-y-8">
          <motion.button
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group relative bg-white text-black px-16 py-5 rounded-full text-xl font-light overflow-hidden shadow-2xl"
          >
            <span className="relative z-10 flex items-center gap-3">
              Begin Your Journey{" "}
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                →
              </motion.span>
            </span>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-gray-100 to-gray-200"
              initial={{ x: "-100%" }}
              whileHover={{ x: 0 }}
              transition={{ duration: 0.4 }}
            />
          </motion.button>
          <p className="text-sm text-gray-600">
            Join thousands discovering a better way to stay informed
          </p>
        </div>
      </div>
    </section>
  );
};

export default WelcomePage;
