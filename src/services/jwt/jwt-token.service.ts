import { Injectable, Inject, Optional } from '@nestjs/common';
import { JwtService, JwtVerifyOptions } from '@nestjs/jwt';

export interface UserTokenPayload {
  sub: string;
  agentId: string;
  iat?: number;
  exp?: number;
  [key: string]: any; // Allow additional fields
}

export interface JwtTokenServiceConfig {
  secret: string;
  expiresIn?: string | number; // Default expiry (e.g., '1h', 3600)
  genericExpiresIn?: string | number; // Default for generic tokens
}

@Injectable()
export class JwtTokenService {
  private readonly config: JwtTokenServiceConfig;

  constructor(
    private readonly jwtService: JwtService,
    @Optional() @Inject('JWT_CONFIG') config?: JwtTokenServiceConfig,
  ) {
    // Default config if not provided
    this.config = config || {
      secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
      expiresIn: '24h',
      genericExpiresIn: '1h',
    };
  }

  async signUserToken(
    userId: string,
    agentId: string,
    ttlSeconds?: number,
  ): Promise<string> {
    const expiresIn = ttlSeconds !== undefined 
      ? ttlSeconds 
      : this.config.expiresIn;
    
    const payload: UserTokenPayload = {
      sub: userId,
      agentId,
      iat: Math.floor(Date.now() / 1000),
    };
    return this.jwtService.sign(payload, {
      secret: this.config.secret,
      algorithm: 'HS256',
      expiresIn: expiresIn as any,
    });
  }

  async verifyToken<T extends object = any>(
    token: string,
  ): Promise<UserTokenPayload & T> {
    const options: JwtVerifyOptions = { 
      secret: this.config.secret, 
      algorithms: ['HS256'] 
    };
    return this.jwtService.verify<UserTokenPayload & T>(token, options);
  }

  async signGenericToken(
    payload: Record<string, any>,
    ttlSeconds?: number,
  ): Promise<string> {
    const expiresIn = ttlSeconds !== undefined 
      ? ttlSeconds 
      : this.config.genericExpiresIn;
    
    const base: Record<string, any> = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
    };
    return this.jwtService.sign(base, {
      secret: this.config.secret,
      algorithm: 'HS256',
      expiresIn: expiresIn as any,
    });
  }
}
