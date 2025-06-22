import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface RouteGuard {
  path: string | RegExp;
  canActivate: () => boolean | Promise<boolean>;
  redirectTo?: string;
  onBlock?: (blockedPath: string) => void;
}

export function useRouteGuard(guards: RouteGuard[]) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const checkGuards = async () => {
      setIsChecking(true);
      setIsBlocked(false);

      for (const guard of guards) {
        const pathMatches = typeof guard.path === 'string' 
          ? location.pathname === guard.path
          : guard.path.test(location.pathname);

        if (pathMatches) {
          try {
            const canActivate = await guard.canActivate();
            
            if (!canActivate) {
              setIsBlocked(true);
              
              if (guard.onBlock) {
                guard.onBlock(location.pathname);
              }
              
              if (guard.redirectTo) {
                navigate(guard.redirectTo, { replace: true });
              }
              
              break;
            }
          } catch (error) {
            console.error('Route guard error:', error);
            setIsBlocked(true);
            
            if (guard.redirectTo) {
              navigate(guard.redirectTo, { replace: true });
            }
            
            break;
          }
        }
      }

      setIsChecking(false);
    };

    checkGuards();
  }, [location.pathname, guards, navigate]);

  return { isChecking, isBlocked };
}

// Pre-defined common guards
export const authGuard = (isAuthenticated: boolean): RouteGuard => ({
  path: /^\/(?!$|privacy|terms)/,
  canActivate: () => isAuthenticated,
  redirectTo: '/',
  onBlock: (path) => console.log('Blocked access to authenticated route:', path)
});

export const mainAppGuard = (hasAcceptedSafety: boolean): RouteGuard => ({
  path: '/',
  canActivate: () => hasAcceptedSafety,
  onBlock: () => console.log('Safety warning must be accepted first')
});