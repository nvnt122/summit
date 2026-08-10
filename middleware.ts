import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function buildLoginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  const originalPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = '/login';
  url.search = '';
  if (originalPath && originalPath !== '/login') {
    url.searchParams.set('redirect', originalPath);
  }
  return url;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public pages
  const publicPaths = ['/login', '/register', '/forgot_password'];
  const isPublicPath = publicPaths.some((path) => pathname === path || pathname.startsWith(path + '/'));

  // Get token from cookies
  const token = request.cookies.get('token')?.value;

  if (!isPublicPath) {
    // PROTECTED ROUTE CHECK
    if (!token) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }

    // ACTIVE TOKEN VALIDATION VIA API
    try {
      const apiHost = process.env.NEXT_PUBLIC_API_URL;
      const apiUrl = `${apiHost}/api/getUserDeafults`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': token.startsWith('token ') ? token : `token ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok || response.status === 403 || response.status === 401) {
        // Token has expired or is invalid! Clear the cookie and redirect to login
        const redirectResponse = NextResponse.redirect(buildLoginRedirect(request));
        redirectResponse.cookies.set('token', '', { path: '/', maxAge: 0 });
        return redirectResponse;
      }
    } catch (error) {
      // In case of a temporary backend failure or timeout, allow access to keep the app working
      console.error('Middleware token validation error:', error);
    }
  } else {
    // PUBLIC ROUTE CHECK (e.g., trying to access /login while logged in)
    if (token) {
      try {
        const apiHost = process.env.NEXT_PUBLIC_API_URL;
        const apiUrl = `${apiHost}/api/getUserDeafults`;

        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': token.startsWith('token ') ? token : `token ${token}`,
            'Accept': 'application/json',
          },
        });

        if (response.ok && response.status !== 403 && response.status !== 401) {
          // Already authenticated and token is valid - honor a pending
          // `redirect` (e.g. reached /login mid hand-off) or fall back home.
          const url = request.nextUrl.clone();
          const pendingRedirect = request.nextUrl.searchParams.get('redirect');
          if (pendingRedirect && pendingRedirect.startsWith('/') && !pendingRedirect.startsWith('//')) {
            return NextResponse.redirect(new URL(pendingRedirect, request.url));
          }
          url.pathname = '/product-category';
          url.search = '';
          return NextResponse.redirect(url);
        }
      } catch (error) {
        // Ignore validation errors for public paths
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes
     * - static files (_next/static)
     * - image optimization (_next/image)
     * - favicon.ico, images, stylesheets, or other assets with file extensions
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
