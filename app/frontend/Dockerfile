FROM nginx:1.25-alpine

COPY signup.html    /usr/share/nginx/html/signup.html
COPY signin.html    /usr/share/nginx/html/signin.html
COPY dashboard.html /usr/share/nginx/html/dashboard.html
COPY nginx.conf     /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]