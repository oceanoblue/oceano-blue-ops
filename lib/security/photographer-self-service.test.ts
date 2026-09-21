import {expect,it} from 'vitest';
import {photographerSelfServicePath} from './photographer-self-service';
it('allows only the precise self-service endpoints and keeps office controls blocked',()=>{
 for(const path of ['/api/scheduling/hours','/api/scheduling/time-off','/api/scheduling/respond','/api/auth/google/connect','/api/auth/google/callback','/api/auth/google/disconnect'])expect(photographerSelfServicePath(path)).toBe(true);
 for(const path of ['/dashboard/settings/availability','/dashboard/orders','/api/orders','/api/scheduling/profiles','/api/scheduling/hours/other','/api/scheduling/respond/other','/api/auth/google/admin'])expect(photographerSelfServicePath(path)).toBe(false);
});
