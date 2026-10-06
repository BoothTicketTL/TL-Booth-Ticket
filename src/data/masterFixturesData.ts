// NO built-in schedule.
// Match fixtures come ONLY from the official Google Sheets (see syncFromOfficialDualSheets in
// src/lib/fixturesService.ts). Earlier versions kept an AI-generated sample schedule here, which did
// not match the real sheets. It was removed on purpose: do not re-add generated/mock fixtures.
import { FixtureItem } from '../types';

export const MASTER_SEASON_FIXTURES: FixtureItem[] = [];
