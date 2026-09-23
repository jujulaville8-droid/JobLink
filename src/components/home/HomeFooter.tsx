import Link from "next/link";
import Brand from "./Brand";
export default function HomeFooter() {
  return <footer className="home-footer"><Brand /><nav aria-label="Footer navigation"><Link href="/jobs">Find jobs</Link><Link href="#employers">For employers</Link><Link href="/about">About</Link><a href="mailto:hello@joblinkantigua.com">Contact</a><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><p>ANTIGUA &amp; BARBUDA<br />ALWAYS A BRIGHTER TOMORROW<span className="home-coral-stroke" /></p></footer>;
}
