import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { WorkspacesService } from './workspaces.service';

// JwtAuthGuard 다음에 사용: URL 의 :workspaceId 가 로그인한 사용자의 것인지 확인
@Injectable()
export class WorkspaceOwnerGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const workspaceId = req.params.workspaceId;
    if (typeof workspaceId !== 'string') {
      throw new NotFoundException('워크스페이스를 찾을 수 없습니다.');
    }
    await this.workspaces.assertOwner(req.user.sub, workspaceId);
    return true;
  }
}
