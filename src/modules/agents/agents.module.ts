import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agents } from '../../entities/agents.entity';
import { AgentsService } from '../../services/agents/agents.service';

@Module({
  imports: [TypeOrmModule.forFeature([Agents])],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
