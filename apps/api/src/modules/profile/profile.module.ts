import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitiesController } from './cities.controller';
import { CityService } from './city.service';
import { ProfileController } from './profile.controller';
import { ProfileReader } from './profile-reader.service';
import { ProfileService } from './profile.service';
import { CityRepository } from './repositories/city.repository';
import { ProfileRepository } from './repositories/profile.repository';

@Module({
  imports: [AuthModule],
  controllers: [CitiesController, ProfileController],
  providers: [CityService, ProfileService, ProfileReader, CityRepository, ProfileRepository],
  exports: [CityService, ProfileReader],
})
export class ProfileModule {}
