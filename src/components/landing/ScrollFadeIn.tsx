import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

interface ScrollFadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Use "up" (default), "left", or "right" */
  direction?: "up" | "left" | "right";
}

const directionOffset = {
  up: { x: 0, y: 24 },
  left: { x: -24, y: 0 },
  right: { x: 24, y: 0 },
};

const variants: (dir: "up" | "left" | "right") => Variants = (dir) => ({
  hidden: {
    opacity: 0,
    x: directionOffset[dir].x,
    y: directionOffset[dir].y,
  },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
});

export const ScrollFadeIn = ({
  children,
  className,
  delay = 0,
  direction = "up",
}: ScrollFadeInProps) => (
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.15 }}
    variants={variants(direction)}
    transition={{ delay }}
    className={className}
  >
    {children}
  </motion.div>
);

/** Stagger wrapper — wrap a list of items so each fades in slightly later */
export const StaggerContainer = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={{
      hidden: {},
      visible: { transition: { staggerChildren: 0.08 } },
    }}
    className={className}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 16 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
      },
    }}
    className={className}
  >
    {children}
  </motion.div>
);
