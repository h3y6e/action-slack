import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import catppuccin from '@catppuccin/starlight';

export default defineConfig({
  site: 'https://h3y6e.github.io',
  base: '/action-slack',
  integrations: [
    starlight({
      title: 'action-slack',
      plugins: [catppuccin({ dark: { flavor: 'frappe' } })],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/h3y6e/action-slack',
        },
      ],
      sidebar: [
        { label: 'Usage', autogenerate: { directory: 'usage' } },
        { label: 'Use Cases', autogenerate: { directory: 'usecase' } },
      ],
      editLink: {
        baseUrl: 'https://github.com/h3y6e/action-slack/edit/main/docs/',
      },
    }),
  ],
});
