import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'thermal-label',
  description: 'TypeScript drivers and transports for thermal label printers.',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Related orgs', link: '/related-orgs' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Drivers', link: '/guide/drivers' },
          { text: 'CLI', link: '/guide/cli' },
          { text: 'Integrating', link: '/guide/integrating' },
        ],
      },
      { text: 'Related organizations', link: '/related-orgs' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/thermal-label' }],
    footer: {
      message:
        'MIT licensed projects. Not affiliated with printer manufacturers. <a href="https://github.com/sponsors/mannes" rel="noopener noreferrer">Sponsor on GitHub</a>',
      copyright: 'Copyright © thermal-label',
    },
    search: { provider: 'local' },
  },
});
