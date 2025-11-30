import { motion } from "framer-motion";

const Loading = () => {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="relative">
        {/* Animated background orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-20 -left-20 w-40 h-40 bg-white/5 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
          className="absolute -bottom-20 -right-20 w-48 h-48 bg-white/5 rounded-full blur-3xl"
        />

        {/* Logo and text */}
        <div className="relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-light mb-4 tracking-tight text-white">
              InfoNow
            </h1>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "60px" }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="h-[1px] bg-white/40 mx-auto mb-8"
            />
          </motion.div>

          {/* Animated dots */}
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
                className="w-2 h-2 bg-white/60 rounded-full"
              />
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-sm text-gray-600 font-light mt-8"
          >
            Preparing your intelligence feed
          </motion.p>
        </div>
      </div>
    </div>
  );
};

export default Loading;
