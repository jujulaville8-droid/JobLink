import type { ImgHTMLAttributes } from 'react';

// Test-only adapter: preserves the real Brand image and dimensions without Next's server.
export default function Image(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} alt={props.alt ?? ''} />;
}
