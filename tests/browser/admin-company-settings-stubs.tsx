import React from 'react';

const router = { push: () => {}, replace: () => {}, back: () => {} };
export function useRouter() { return router; }
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) } };
}
export default function Link({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href} {...props}>{children}</a>;
}
