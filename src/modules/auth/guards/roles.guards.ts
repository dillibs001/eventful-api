import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Find the roles required for this specific route
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If the route has no @Roles() decorator, let everyone through
    if (!requiredRoles) {
      return true;
    }

    // 2. Get the user from the request (attached earlier by JwtAuthGuard)
    const { user } = context.switchToHttp().getRequest();

    // 3. Check if the user's role matches one of the required roles
    return requiredRoles.includes(user?.role);
  }
}