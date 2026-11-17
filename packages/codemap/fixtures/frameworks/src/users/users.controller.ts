import { Controller, Get, Post } from '@nestjs/common'
import { UsersService } from './users.service'
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  findAll() { return this.users.findAll() }
  @Post()
  create() { return this.users.create() }
}
