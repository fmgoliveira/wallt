# Changelog

## [1.1.0](https://github.com/fmgoliveira/wallt/compare/v1.0.0...v1.1.0) (2026-11-11)


### Features

* optional receipt attachments on transactions (P2.6b) ([#87](https://github.com/fmgoliveira/wallt/issues/87)) ([8821ee4](https://github.com/fmgoliveira/wallt/commit/8821ee40052de70cd7f02b40f7f9c470f9433024))

## 1.0.0 (2026-11-11)


### Features

* **core:** money, dates and core Zod schemas ([#8](https://github.com/fmgoliveira/wallt/issues/8)) ([#69](https://github.com/fmgoliveira/wallt/issues/69)) ([454d17e](https://github.com/fmgoliveira/wallt/commit/454d17eb72e10891ba59d6d0859078d3cedc49a9))
* **core:** remaining Zod schemas ([#8](https://github.com/fmgoliveira/wallt/issues/8)) ([#70](https://github.com/fmgoliveira/wallt/issues/70)) ([2b33c51](https://github.com/fmgoliveira/wallt/commit/2b33c51ae53b9b86606de339322b63ba8d2b30a6))
* **db:** Drizzle schema, migrations and category seed ([#9](https://github.com/fmgoliveira/wallt/issues/9), part A) ([#71](https://github.com/fmgoliveira/wallt/issues/71)) ([8d9ef45](https://github.com/fmgoliveira/wallt/commit/8d9ef4574507420b9299609a3cd028bcc3d54c68))
* **db:** server-only tables and import_profiles ([#9](https://github.com/fmgoliveira/wallt/issues/9), part B) ([#72](https://github.com/fmgoliveira/wallt/issues/72)) ([e8c7a3e](https://github.com/fmgoliveira/wallt/commit/e8c7a3e6706759ed3907f5d72574ba6d5bb1f291))
* P2 core app, local-only first ([#14](https://github.com/fmgoliveira/wallt/issues/14)-[#22](https://github.com/fmgoliveira/wallt/issues/22), [#79](https://github.com/fmgoliveira/wallt/issues/79)) ([#80](https://github.com/fmgoliveira/wallt/issues/80)) ([826b1e9](https://github.com/fmgoliveira/wallt/commit/826b1e93482a0901f0e1c43b5440b2921dcecd48))
* P3 sync — HLC, outbox, /sync endpoints, client engine, convergence tests ([#23](https://github.com/fmgoliveira/wallt/issues/23)-[#26](https://github.com/fmgoliveira/wallt/issues/26)) ([#81](https://github.com/fmgoliveira/wallt/issues/81)) ([e08e12e](https://github.com/fmgoliveira/wallt/commit/e08e12e9b099384432f4907ee624fabdc11b0147))
* P4 budgets, recurring, goals & debts, FX, reports, notifications ([#27](https://github.com/fmgoliveira/wallt/issues/27)-[#32](https://github.com/fmgoliveira/wallt/issues/32)) ([#82](https://github.com/fmgoliveira/wallt/issues/82)) ([d51cf57](https://github.com/fmgoliveira/wallt/commit/d51cf57460de76eecca3a7351d8c99c8f5bd0ddf))
* P5 universal import — parsers, pipeline, wizard, formats manager ([#33](https://github.com/fmgoliveira/wallt/issues/33)-[#39](https://github.com/fmgoliveira/wallt/issues/39)) ([#83](https://github.com/fmgoliveira/wallt/issues/83)) ([e667aaa](https://github.com/fmgoliveira/wallt/commit/e667aaa3c83127795b44b05edd7c84372efd2551))
* P6 categorization — rules, aliases, local classifier, review queue, metrics ([#40](https://github.com/fmgoliveira/wallt/issues/40)-[#44](https://github.com/fmgoliveira/wallt/issues/44)) ([#84](https://github.com/fmgoliveira/wallt/issues/84)) ([cee8823](https://github.com/fmgoliveira/wallt/commit/cee88233c885a6e646dc4db7b70a394db5847c60))
* P7 polish & release — i18n, a11y, onboarding, data tools, e2e, release pipeline ([#50](https://github.com/fmgoliveira/wallt/issues/50)-[#54](https://github.com/fmgoliveira/wallt/issues/54)) ([#85](https://github.com/fmgoliveira/wallt/issues/85)) ([b934b6b](https://github.com/fmgoliveira/wallt/commit/b934b6bff33efed23f6058ed42b9fc38f7facc2d))
* **server:** auth - setup, mandatory 2FA, login, rotating refresh tokens ([#11](https://github.com/fmgoliveira/wallt/issues/11), part A) ([#75](https://github.com/fmgoliveira/wallt/issues/75)) ([f4c2a93](https://github.com/fmgoliveira/wallt/commit/f4c2a9358c817c38e48ed8882555fa5cb2371ec2))
* **server:** device management and re-auth for sensitive auth actions ([#11](https://github.com/fmgoliveira/wallt/issues/11), part B) ([#76](https://github.com/fmgoliveira/wallt/issues/76)) ([9ac5302](https://github.com/fmgoliveira/wallt/commit/9ac53020ca49bfb475ae86b2efa2356c50c4b72f))
* **server:** encrypted backup archive, retention and restore CLI ([#13](https://github.com/fmgoliveira/wallt/issues/13), part A) ([#77](https://github.com/fmgoliveira/wallt/issues/77)) ([2cfef3e](https://github.com/fmgoliveira/wallt/commit/2cfef3e7501fb613c7c96d43d6ed02debe6d9589))
* **server:** Google Drive backups, drive-auth and restore from Drive ([#13](https://github.com/fmgoliveira/wallt/issues/13), part B) ([#78](https://github.com/fmgoliveira/wallt/issues/78)) ([449070e](https://github.com/fmgoliveira/wallt/commit/449070e4c7f0b919504a3c6aaef577e54bdbaab5))
* **server:** Hono skeleton with config, logging, /health, migrations ([#10](https://github.com/fmgoliveira/wallt/issues/10)) ([#73](https://github.com/fmgoliveira/wallt/issues/73)) ([af99e64](https://github.com/fmgoliveira/wallt/commit/af99e645e10b64b903338b171a6013ccc781a4b6))
