import { IsEmail, IsString, MaxLength } from 'class-validator';

export class SendDocumentEmailDto {
  @IsString()
  @IsEmail()
  @MaxLength(320)
  recipient!: string;
}
