import { motion } from "framer-motion";

type CardFlipProps = {
  front: string;
  back: string;
  flipped: boolean;
  onToggle: () => void;
};

export function CardFlip({ front, back, flipped, onToggle }: CardFlipProps) {
  return (
    <div className="flip-wrap">
      <motion.div
        className="flip-card"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        onClick={onToggle}
      >
        <article className="flip-face">
          <h3>Front</h3>
          <p>{front}</p>
          <small>Tap card to reveal answer</small>
        </article>
        <article className="flip-face back">
          <h3>Back</h3>
          <p>{back}</p>
          <small>Tap card to return</small>
        </article>
      </motion.div>
    </div>
  );
}
